n=int(input("Enter the NUmber:"))
num=n//2 *3
for i in range(n):
    for j in range(n):
        if  i+j == num or i+j == n //2 or i-j == n//2 or j-i==n//2: 
            print("*",end= '')
            
        else:
            print(end=' ')
    print()
