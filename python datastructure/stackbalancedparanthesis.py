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
#parenthesis mathces
    #balanced [{()}]
    #unbalaced [{]}
def match(p1 , p2):
    if p1 == "["  and p2 == "]":
        return True
    elif p1 == "{"  and p2 == "}":
        return True
    elif p1 == "("  and p2 == ")":
        return True
    else:
        return False
def balanced_parenthesis(paranthesis):
    s = Stack()
    is_balanced = True
    index = 0
    while index < len(paranthesis) and is_balanced:
        paren = paranthesis[index]
        if paren in "[{(" :
            s.push(paren)
        else:
            if s.is_empty():
                is_balanced = False
            else:
                top = s.pop()
                if not match(top , paren):
                    is_balance = False
        index += 1
    if s.is_empty() and is_balanced:
        return True
    else:
        return False
print((balanced_parenthesis("[{]")))









                
                
            
