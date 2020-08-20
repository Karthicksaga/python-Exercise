class Node:
    def __init__(self,data):
        self.data = data
        self.left = None
        self.right = None

class BST:
    def __init__(self):
        self.root = None

    def insert(self , data):
        if self.root is None:
            self.root = Node(data)

        else:
            self.insert1(data , self.root)

    def insert1(self , data , current_node):

        if data  >  current_node.data:
            if current_node.right is None:
                current_node.right = Node(data)
            else:
                current_node.right = self.insert1(data , current_node.right)
        elif data < current_node.data:
            if current_node.left is None:
                current_node.left = Node(data)
            else:
                current_node.left = self.insert1(data , current_node.left)
        else:
            print("Data is already present")

    def find(self , data):
        if self.root:
            is_find = self.find1(data , self.root)
            if is_find:
                return True
            return False
        else:
            return  None
        
    def find1(self , data ,current_node):
        if data > current_node.data and current_node.right:
            return self.find1(data , current_node.right)
        
        if data < current_node.data and current_node.left:
            return  self.find1(data , current_node.left)
        elif data == current_node.data:
            return True
        else:
            print("Not present")

bst = BST()
bst.insert(2)
bst.insert(4)
bst.insert(6)
bst.insert(1)
bst.insert(9)
bst.insert(9)

print(bst.find(9))

            
            
            
            
            



            
            





        
