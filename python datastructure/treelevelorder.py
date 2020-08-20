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
            return self.items[-1].
    def display(self):
        return self.items
    def size(self):
        return len(self.items)
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
            
bt = BinaryTree(1)
bt.root.left = Node(2)
bt.root.right = Node(3)
bt.root.left.left =Node(4)
bt.root.left.right = Node(5)
bt.root.right.left = Node(6)
bt.root.right.right = Node(7)

print(bt.print_tree("inorder"))
print(bt.print_tree("levelorder"))

