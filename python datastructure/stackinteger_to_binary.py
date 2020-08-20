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

def int_to_bin(num):
    s = Stack()
    remainder = 0
    while num > 0:
        remainder = num % 2
        s.push(remainder)
        num = num // 2
    binary = " "
    while not s.is_empty():
        binary += str(s.pop())
    

    return binary


print(int_to_bin(8383838338))













    
        
