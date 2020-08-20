class Node:
    def __init__(self , data):
        self.data = data
        self.next = None
        self.prev = None
class DBL:
    def __init__(self):
        self.head = None
    def append(self  , data):
        if self.head is None:
            newnode = Node(data)
        
            newnode.prev = None
            self.head = newnode
            
        else:
            newnode =Node(data)
            cur = self.head
            while cur.next:
                cur =cur.next
            newnode.prev = cur
            newnode.next =None

    def prepend(self ,data):
        if self.head is None:
            newnode = Node(data)
            newnode.prev = None
            self.head = newnode
        else:
            newnode = Node(data)
            self.head.prev = newnode
            newnode.next = self.head
            self.head = newnode
            newnode.prev = None
            
    def add_after(self ,key ,data):
        cur = self.head
        while cur:
            if cur.next is None and cur.data == key :
                self.append(data)
                return
            elif cur.data == key:
                newnode =Node(data)
                nxt =cur.next
                cur.next = newnode
                newnode.next = nxt
                nxt.prev = newnode
                newnode.prev = cur
            cur = cur.next
    def add_before(self  , key , data):
        cur = self.head 
        while cur: 
            if cur.prev is None and cur.data == key:
                self.prepend(data)
            elif cur.data == key:
                newnode = Node(data)
                pre = cur.prev
                cur.prev = newnode
                newnode.prev = pre
                pre.next = newnode
                newnode.next = cur
            cur = cur.next
    def delete(self ,key):
        cur = self.head
        while cur:
            if  cur.data ==key and cur == self.head:
                #case1
                if not cur.next:
                    cur = None
                    self.head = None
                    return
                else:
                #case2
                    nxt = cur.next
                    cur.next = None
                    nxt.prev = None
                    cur = None
                    self.head = nxt

            elif cur.data == key:
                #case3
                if cur.next:
                    nxt = cur.next 
                    prev = cur.prev
                    prev.next = nxt
                    nxt.prev = prev
                    cur.next = None 
                    cur.prev = None
                    cur = None
                    return
                else:
                    #case4
                    pre = cur.prev
                    prev.next  = None
                    cur.prev = None
                    cue = None
                    return
            cur = cur.next

                

                
                        
        
    
    def display(self):
        cur = self.head
        while cur:
            print(cur.data)
            cur = cur.next
    
db = DBL()
db.append(1)
db.prepend(2)
db.prepend(3)
db.prepend(4)
db.prepend(5)
db.add_after(4,7)
db.add_before(4 ,8)

print(db.display())
db.delete(4)
print(db.display())













         
            
