class Stack:
    def  __init__ (self):
        self.item = []
    def is_empty(self):
        return self.item == []
    def push(self, item):
        self.item.append(item)
    def pop(self):
        if  self.is_empty():
            print("Stack is empty")
        return self.item.pop()
    
    def peek(self):
        if  not self.is_empty():
            return self.item[-1]
    def display(self):
        return self.item
stack1 = Stack()
stack1.push(5)
stack1.push(1)
stack1.push(7)
stack1.push(58)
stack1.push(2)
stack1.push(1)
print(stack1.display())
stack1.pop()
stack1.pop()
stack1.pop()
stack1.pop()
stack1.pop()
stack1.pop()

print(stack1.display())

print(stack1.is_empty())

