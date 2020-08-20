#circular llink list
class Node:
    def __init__(self , data):
        self.data = data
        self.next = None

class Circularlink_List:
    def __init__(self ):
        self.head = None
        
    def append ( self , data ):
        if  self.head is None:
            newnode =Node(data)
            self.head = newnode
            self.head.next = self.head
        else:
            newnode = Node(data)
            cur  = self.head
            while cur.next != self.head:
                cur =cur.next
            cur.next = newnode
            newnode.next = self.head
                
    def prepend(self ,data):
        cur = self.head
        newnode = Node(data)
        newnode.next = self.head
        if self.head is None:
            newnode.next = newnode
        else:
            while cur.next != self.head:
                cur = cur.next
            cur.next = newnode
        self.head = newnode
        def add(self , pre_node, data):
        if  not pre_node:
            print("There is not in previous data")
            return
        newnode = Node(data)
        newnode.next = pre_node.next
        pre_node.next = newnode

    def display(self):
        cur = self.head
        while cur:
            print(cur.data)
            cur = cur.next
            if cur == self.head:
                break
cl =Circularlink_List()
cl.append(1)
cl.append(2)
cl.append(3)
cl.prepend(4)
cl.prepend(5)
cl.add_data(3,6)
print(cl.display())


    
