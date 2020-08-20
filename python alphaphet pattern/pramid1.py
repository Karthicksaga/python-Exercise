no=0
print("*******Pyramid*******")
num=int(input("Enter the number:"))
for i in range(1,num): 
    for j in range(num-i): # total no of rows -row no Example 5-1=4(print (space )) 
        print(end = "  ")  #printing for (space)
    for k in range (2*i - 1):   # 2* row no -1 print (star)
        
        print("*", end = " ")
    print()
        
