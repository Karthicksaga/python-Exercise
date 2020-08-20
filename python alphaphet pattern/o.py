n=int(input())
m=int(input())
for i in range (n):
    for j in range (m):
        if  (j == 0 and (i!=0 and i!=6)) or (j == 4 and (i!=0 and i!=6))  :
            print("*", end ='')
        elif ((i==0 or i==6) and (j>0 and j<4)):
            print("*", end ='')
       
        
        else:
            print(end=" ")
    print()
            
