class Node:
    def __init__ (self , data):
        self.data = data
        self.next = None

class Linklist:
    def  __init__ (self):
        self.head = None

    def display(self):
        current_node = self.head
        while current_node:
            print(current_node.data)
            current_node =current_node.next 
    def find(self , key):
        cur =self.head
        while cur:
            if cur.data == key :
                print("Data is Found:" ,cur.data)
            cur = cur.next
    def append(self , data):
        newnode = Node(data)
        if self.head is None:
            self.head = newnode
            return
        cur = self.head
        while cur.next:
            cur  =cur.next
        cur.next = newnode
    def append1(self , data):
        newnode = Node(data)
        if self.head is None:
            self.head = newnode
            return
        cur = self.head
        while cur.next:
            cur  =cur.next
        cur.next = newnode
    def prepend(self , data):
        newnode = Node(data)
        newnode.next = self.head
        self.head= newnode

        
    def add(self , key, data):
        cur = self.head
        while cur:
            if cur.data == key:
                newnode = Node(data)
                prev = cur
                cur = cur.next
                prev.next = newnode
                newnode.next = cur
            cur = cur.next

    def sort(self):
        cur  = self.head
        while cur:
            if cur.data  <  cur.next.data:
                temp = cur.data
                cur.data = cur.next.data
                cur.next.data = temp
            
            cur = cur.next
        return self.display()
    
        

        
            
    def delete(self,key):
        cur_node = self.head
        if cur_node and cur_node.data == key:
            cur_node.next = self.head
            cur_node = None
        pre = None
        while  cur_node and cur_node.data != key:
            pre = cur_node
            cur_node = cur_node.next
        pre.next = cur_node.next
        cur_node =None

        
            
llist = Linklist()
llist.append(31)
llist.append(23)
llist.append(3)
llist.append(4)
llist.append(56)
llist.append(62)
llist.append1(7)
llist.delete(7)

print(llist.find(8))
print(llist.sort())
