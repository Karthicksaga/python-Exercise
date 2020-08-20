class Queue:
    def __init__(self ):
        self.items = []
    def enqueue(self, item):
        return self.items.insert(0 , item)
    def dequeue(self ):
        if not self.is_empty():
            return self.items.pop()
        else:
            return False
    def is_empty(self):
        return self.items == 0
    def peek(self):
        if not self.is_empty():
            return self.items[-1]
    def display(self):
        return self.items
q=Queue()
q.enqueue(2)
q.enqueue(3)
q.enqueue(4)
q.enqueue(5)
q.enqueue(10)
print(q.display())
q.dequeue()
print(q.display())
print(q.peek())
