def mergesort(list1):
    if len(list1) > 1:
        mid= len(list1) // 2
        left_list = list1[:mid]
        right_list = list1[mid:]
        mergesort(left_list)
        mergesort(right_list)

        i=j=k=0
        while (i<len(left_list) and j <len(right_list)):
        
            if left_list[i]< right_list[j]:
                list1[k] = left_list[i]
                i=i+1
                k=k+1
            else:
                list1[k] = right_list[j]
                j=j+1
                k=k+1
            
            
        while i < len(left_list):
            list1[k] = left_list[i]
            i=i+1
            k=k+1
            
        while j < len(right_list):
            list1[k] = right_list[j]
            j=j+1
            k=k+1
            
    return list1
         
n=int(input("How many elements in the list"))

list1=[int(input()) for x in range(n)]
mergesort(list1)
print(list1)
    
    
    #another code
    
    
def merge_sort(array):

    if len(array) <= 1:
        return array

    midpoint = int(len(array) / 2)

    left, right = merge_sort(array[:midpoint]), merge_sort(array[midpoint:])

    return merge(left, right)


def merge(left, right):

    result = []
    left_pointer = right_pointer = 0

    while left_pointer < len(left) and right_pointer < len(right):

        if left[left_pointer] < right[right_pointer]:

            result.append(left[left_pointer])
            left_pointer += 1

        else:

            result.append(right[right_pointer])
            right_pointer += 1

    result.extend(left[left_pointer:])
    result.extend(right[right_pointer:])

    return result


def main():
    array = [5, 4, 3, 2, 1]
    print(array)

    result = merge_sort(array)
    print(result)

if __name__ == "__main__":
    main()