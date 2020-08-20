class Stack:
    def __init__(self):
        self.items = []
    def  is_empty(self):
        return self.items == []
    def is_full(self):
        pass
    def peek(self):
        if  not self.is_empty():
            return self.items[-1]
        return False
    def push(self ,item): 
            return self.items.append(item)
    def pop(self ):
        if  not self.is_empty():
            return self.items.pop()
        return False
    def size(self):
        return len(self.items)
    def __len__(self):
        return self.size()
        
class Queue(object):
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
    def size(self):
        a =  len(self.items)
        return a
    def __len__(self):
        return self.size()
    
class Node:
    def __init__(self ,data):
        self.data = data
        self.left = None
        self.right =None
class BinaryTree:
    def __init__(self ,root):
        self.root =Node(root)

    def print_tree(self , traversal_type):
        if traversal_type == "preorder":
            return self.preorder(bt.root , " " )
        elif traversal_type == "inorder":
            return self.inorder(bt.root , " " )
        elif traversal_type == "postorder":
            return self.postorder(bt.root , " " )
        elif traversal_type == "levelorder":
            return self.levelorder(bt.root )  
        elif traversal_type == "reverseorder":
            return self.reverselevel(bt.root )
        elif traversal_type == "Size_of_tree":
            return self.Size(bt.root ) 
        else:
            print("traversal type  "+  str(traversal_type)  + "  is not supported")
        return False
    def preorder(self , start , traversal):# start means a current node or Root Node
        if start:
            traversal +=  (str(start.data) + " ")    #traversal function used to update a value
            traversal =self.preorder(start.left, traversal)
            traversal =self.preorder(start.right , traversal)
        return traversal
    def inorder(self , start , traversal):# start means a current node or Root Node
        if start:
                #traversal function used to update a value
            traversal = self.inorder(start.left, traversal)
            traversal +=  (str(start.data) + " ")
            traversal = self.inorder(start.right , traversal)
        return traversal
    def postorder(self , start , traversal):# start means a current node or Root Node
        if start:
                #traversal function used to update a value
            traversal =self.postorder(start.left, traversal)
            traversal =self.postorder(start.right , traversal)
            traversal +=  (str(start.data) + " ")
        return traversal
    def levelorder(self , start):
        if start is None:
            return False
        q = Queue()
        q.enqueue(start)
        traversal = " "
        
        while len(q) > 0:
            traversal += (str(q.peek().data) + "-")
            node = q.dequeue()
            if node.left:
                 q.enqueue(node.left)
            if node.right:
                 q.enqueue(node.right)               
        return traversal

    def reverselevel(self ,start):
        if start is None:
            return False
        q = Queue()
        s = Stack()
        q .enqueue(start)
        traversal = " "
        while len(q) > 0:
           node = q.dequeue()
           s.push(node)
           if node.left:
               q.enqueue(node.left)
           if node.right:
                q.enqueue(node.right)
             
        while len(s) > 0:
             
            node = s.pop()
            traversal  +=(str(node.data) + "-")
        return traversal

    def Size(self , start):
        if start is None:
            return
        q = Queue()
        q.enqueue(start)
        size = 0

        while len(q) > 0:
            size = size + 1
            node = q.dequeue()
            if node.left:
                 q.enqueue(node.left)
            if node.right:
                 q.enqueue(node.right)       
        return size

    def height(self ,start):
        if start is None:
            return -1
        left_height = self.height(start.left)
        right_height = self.height(start.right)

        return 1 + max(left_height , right_height) 
    
           
    
            
bt = BinaryTree(1)
bt.root.left = Node(2)
bt.root.right = Node(3)
bt.root.left.left =Node(4)
bt.root.left.right = Node(5)
bt.root.right.left = Node(6)
bt.root.right.right = Node(7)
bt.root.right.left.right = Node(8)

print(bt.print_tree("inorder")) #left - root - right
print(bt.print_tree("preorder")) #root - left - right
print(bt.print_tree("postorder")) #left - right - root
print(bt.print_tree("levelorder")) #print level order 1-2-3-4-5-6-7
print(bt.print_tree("reverseorder")) #print reverse order 7-6-5-4-3-2-1
print(bt.print_tree("Size_of_tree")) #print size of the tree
print(bt.print_tree(bt.root)) #printing the height of the tree 
 print(bt.height(bt.root.right.left )) # print the height of the node

