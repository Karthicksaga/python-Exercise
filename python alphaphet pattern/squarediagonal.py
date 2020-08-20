num = int(input("Enter the num:"))

for row in range(num):
    for col in range(num):
        if row == 0 or col == 0 or row == num - 1 or  col == row or row + col == num - 1 or (col == num - 1):
            print("*" , end = "  ")
        else:
            print(end = "  ")
            print(end= "  ")
    print()
    
        
