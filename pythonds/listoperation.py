#Do not remove the below import statement
import sys

'''This function provides the capacity, size and space left in the list.
You can invoke it to get the details of the list'''

def list_details(lst):
    #Number of elements that can be stored in the list
    print("Capacity:", (sys.getsizeof(lst)-36)//4)

    #Number of elements in the list
    print("Size:", len(lst))

    #Number of elements that can be accommodated in the space left
    print("Space Left:", ((sys.getsizeof(lst)-36) - len(lst*4))//4)

    #formula changes based on the system architecture
    #(size-36)/4 for 32 bit machines and
    #(size-64)/8 for 64 bit machines

    # 36,64 - size of an empty list based on machine
    # 4,8 - size of a single element in the list based on machine


list_product=[]
list_details(list_product)
list_product.append("sugar")
list_product.append("rice")
list_product.append("milk")
list_product.append("biscuit")
print("list product listed below")
print(list_product)
list_details(list_product)
list_product.insert(2,"salt")
list_details(list_product)
print(list_product)
list_product.pop(3)
list_details(list_product)
print(list_product)
list_product.pop()
list_details(list_product)
print("After removing product")
print(list_product)
                                              