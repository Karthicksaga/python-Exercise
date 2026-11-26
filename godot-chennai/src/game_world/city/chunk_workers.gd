class_name ChunkWorkers
extends RefCounted
## The streamer's own worker threads (decision G-51): a queue of jobs taken by `count` threads
## that live as long as the streamer. `WorkerThreadPool.add_task` cost 1.5–7 ms on the main
## thread in the streaming test (its shared lock is busy while the pool runs other work), so
## chunk builds and releases go through this queue, whose lock is held only to append or pop.
##
## Jobs are Callables that touch no node in the tree. `is_done(ticket)` and `wait(ticket)`
## follow one job; `stop()` finishes running jobs and ends the threads.
##
## The main thread never waits for the lock (G-471): the workers run at low priority beside other
## busy threads, and one pre-empted while holding the lock kept the main thread waiting for
## milliseconds. `push` keeps a job in a backlog while the lock is busy (handed over at the next call),
## `take_done` says "not yet". Only one thread (the streamer's) pushes.

var _threads: Array[Thread] = []
var _mutex := Mutex.new()
var _semaphore := Semaphore.new()
var _jobs: Array[Callable] = []
var _tickets: PackedInt64Array = PackedInt64Array()
var _done: Dictionary[int, bool] = {}
var _next: int = 1
var _quit: bool = false
## Jobs pushed while the lock was busy, with their tickets (the pushing thread's only).
var _backlog: Array[Callable] = []
var _backlog_tickets: PackedInt64Array = PackedInt64Array()
var _pending_seen: int = 0


func start(count: int) -> void:
	for i in maxi(1, count):
		var t := Thread.new()
		t.start(_loop, Thread.PRIORITY_LOW)
		_threads.append(t)


func size() -> int:
	return _threads.size()


## Queues a job; returns its ticket. `track` false: nobody asks after it (a release), so its
## ticket is not kept once it is done.
func push(job: Callable, track: bool = true) -> int:
	var ticket := _next if track else -_next
	_next += 1
	_backlog.append(job)
	_backlog_tickets.append(ticket)
	flush()
	return ticket


## Hands the backlog to the workers if the lock is free now (`wait_for_lock`: in any case).
func flush(wait_for_lock: bool = false) -> void:
	if _backlog.is_empty():
		return
	if wait_for_lock:
		_mutex.lock()
	elif not _mutex.try_lock():
		return
	var n := _backlog.size()
	_jobs.append_array(_backlog)
	_tickets.append_array(_backlog_tickets)
	_mutex.unlock()
	_backlog.clear()
	_backlog_tickets.clear()
	for i in n:
		_semaphore.post()


## True once the job has finished (and forgets it; ask once). False while the lock is busy
## (ask again next frame) unless `wait_for_lock`.
func take_done(ticket: int, wait_for_lock: bool = false) -> bool:
	flush()
	if wait_for_lock:
		_mutex.lock()
	elif not _mutex.try_lock():
		return false
	var done := _done.has(ticket)
	if done:
		_done.erase(ticket)
	_mutex.unlock()
	return done


## Blocks until the job has finished (start-up and shutdown only).
func wait(ticket: int) -> void:
	flush(true)
	while true:
		_mutex.lock()
		var done := _done.has(ticket)
		var queued := _tickets.has(ticket)
		_mutex.unlock()
		if done:
			return
		if not queued and _threads.is_empty():
			return
		OS.delay_usec(200)


## Jobs waiting (the last count seen when the lock is busy).
func pending() -> int:
	if _mutex.try_lock():
		_pending_seen = _jobs.size()
		_mutex.unlock()
	return _pending_seen + _backlog.size()


func _loop() -> void:
	while true:
		_semaphore.wait()
		_mutex.lock()
		if _quit:
			_mutex.unlock()
			return
		if _jobs.is_empty():
			_mutex.unlock()
			continue
		var job: Callable = _jobs.pop_front()
		var ticket: int = _tickets[0]
		_tickets.remove_at(0)
		_mutex.unlock()
		job.call()
		job = Callable()
		if ticket > 0:
			_mutex.lock()
			_done[ticket] = true
			_mutex.unlock()


## Lets the queued jobs run, then ends the threads.
func stop() -> void:
	flush(true)
	while _queued() > 0 and not _threads.is_empty():
		OS.delay_usec(500)
	_mutex.lock()
	_quit = true
	_mutex.unlock()
	for t in _threads:
		_semaphore.post()
	for t in _threads:
		t.wait_to_finish()
	_threads.clear()


func _queued() -> int:
	_mutex.lock()
	var n := _jobs.size()
	_mutex.unlock()
	return n
