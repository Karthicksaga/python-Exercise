n=int(input("Enter the no of rows:"))
m=int(input("Enter the no of column:"))
print("*********** Heart printing **************")
for i in range (n):
    for j in range (m):
        if  i+j ==8  or i-j == 2 or (i==0 and j%3 !=0) or (i==1 and j%3 ==0):
            print("*" ,end = "")
        else:
            print(end = "  ")
    print()

        
