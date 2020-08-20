def linearsearch(arr , key):
    for i in range (len(arr) ):
        if (arr[i] == key):
            return i
    return -1
a = [134,54,3,233,45,44]
print("Element present at the index " , linearsearch(a , 45))
