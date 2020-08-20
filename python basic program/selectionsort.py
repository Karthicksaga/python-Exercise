def selsort(arr,n):
    for i in range(0,n-1):
        mini=arr[i]
        k=i
        for j in range (i+1,n):
            if (arr[j] < mini):
                mini =arr[j]
                k = j
        arr[k],arr[i]=arr[i],arr[k]
            


def display(arr,n):
    for i in range (0,n):
        print("sorted array",arr[i])
        
        
n=6

arr=[32,34,56,78,5,70]    

selsort(arr,n)
display(arr,n)