#binary serach
def binarysearch(a , low ,high , key):
    if low <= high:
        mid = (low + high) // 2
        if a[mid]  == key :
            return mid
        elif a[mid] < key :
            return binarysearch(a , mid+1 , high , key)
    
        elif a[mid] > key :
            return binarysearch(a , low , mid - 1 , key)
        else:
            return  None
    
    
    return False

a = [23,44,2,46,99,100]
print(a)
n = len(a) - 1
print("search element find inthe index " , binarysearch(a , 0 , n , 4))
