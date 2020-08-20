for i in range (7):
    for j in range (7):
        if (j <1 and j>5)  :
            print("*", end ='')
       
        elif (i-j==0 or i+j==6):
            print("*", end='')
        else:
            print(end=" ")
    print()
            
