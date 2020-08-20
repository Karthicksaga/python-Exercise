# getMissingNo takes list as argument 
def getMissingNo(A): 
    n = len(A) 
    total = (n + 1)*(n + 2)//2
    sum_of_A=0
    for i in range (0,n):
        sum_of_A = sum_of_A+A[i]
    return total - sum_of_A 
  
# Driver program to test the above function 
A = [1, 2, 4, 5, 6] 
miss = getMissingNo(A) 
print(miss) 
# This code is contributed by Pratik Chhajer
