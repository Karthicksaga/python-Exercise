#num = int(input("Enter the num:"))
for i in range(3):
    for j in range(5):
        if i == j or  i+j == 4:
            print("*" , end=" ")
        else:
            print(end = "  ")
    print()
