class_name ChunkWorkers
extends RefCounted
## The streamer's own worker threads (decision G-51): a queue of jobs taken by `count` threads
## that live as long as the streamer. `WorkerThreadPool.add_task` cost 1.5–7 ms on the main
## thread in the streaming test (its shared lock is busy while the pool runs other work), so
## chunk builds and releases go through this queue, whose lock is held only to append or pop.
##
## Jobs are Callables that touch no node in the tree. `is_done(ticket)` and `wait(ticket)`
## follow one job; `stop()` finishes running jobs and ends the threads.

var _threads: Array[Thread] = []
var _mutex := Mutex.new()
var _semaphore := Semaphore.new()
var _jobs: Array[Callable] = []
var _tickets: PackedInt64Array = PackedInt64Array()
var _done: Dictionary[int, bool] = {}
var _next: int = 1
var _quit: bool = false


func start(count: int) -> void:
	for i in maxi(1, count):
		var t := Thread.new()
		t.start(_loop, Thread.PRIORITY_LOW)
		_threads.append(t)


func size() -> int:
	return _threads.size()


## Queues a job; returns its ticket.
func push(job: Callable) -> int:
	_mutex.lock()
	var ticket := _next
	_next += 1
	_jobs.append(job)
	_tickets.append(ticket)
	_mutex.unlock()
	_semaphore.post()
	return ticket


## True once the job has finished (and forgets it; ask once).
func take_done(ticket: int) -> bool:
	_mutex.lock()
	var done := _done.has(ticket)
	if done:
		_done.erase(ticket)
	_mutex.unlock()
	return done


## Blocks until the job has finished (start-up and shutdown only).
func wait(ticket: int) -> void:
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


## Jobs waiting or running.
func pending() -> int:
	_mutex.lock()
	var n := _jobs.size()
	_mutex.unlock()
	return n


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
		_mutex.lock()
		_done[ticket] = true
		_mutex.unlock()


## Lets the queued jobs run, then ends the threads.
func stop() -> void:
	while pending() > 0 and not _threads.is_empty():
		OS.delay_usec(500)
	_mutex.lock()
	_quit = true
	_mutex.unlock()
	for t in _threads:
		_semaphore.post()
	for t in _threads:
		t.wait_to_finish()
	_threads.clear()
