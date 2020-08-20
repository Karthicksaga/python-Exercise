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
    
    def append(self , data):
        newnode = Node(data)
        if self.head is None:
            self.head = newnode
            return
        last_node = self.head
        while last_node.next:
            last_node  =last_node.next
        last_node.next = newnode
    def prepend(self , data):
        newnode = Node(data)
        newnode.next = self.head
        self.head= newnode
    def add(self , pre_node, data):
        if  not pre_node:
            print("There is not in previous data")
            return
        newnode = Node(data)
        newnode.next = pre_node.next
        pre_node.next = newnode
    def delete(self,key):
        cur_node = self.head
        if cur_node and cur_node.data == key:
            cur_node.next = self.head
            cur_node = None
        pre = None

        while  cur_node and cur_node.data != key:
            pre = cur_node
            cur_node = cur_node.next

        if cur_node is None:
            return
        pre.next = cur_node.next
        cur_node =None

        
            
llist = Linklist()
llist.append(1)
llist.append(2)
llist.append(3)
llist.append(4)
llist.append(5)
llist.append(6)

print(llist.add(llist.head.next,9))
print(llist.display())
llist.delete(2)
llist.delete(5)
print(llist.display())

