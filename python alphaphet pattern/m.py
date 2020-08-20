for i in range (7):
    for j in range (7):
        if (j == 0 or j == 6)  :
            print("*", end ='')
       
        elif (i-j==0 and(i>0 and i<4)) or (i+j==6 and (i>0 and i<4)):
            print("*", end='')
        else:
            print(end=" ")
    print()
            
