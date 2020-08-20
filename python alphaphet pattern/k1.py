num = int(input("Enter the number:"))
col = num // 2
for i in range(num):
    for j in range(num - 2):
        if j ==0 or i - j ==col or i + j ==num -3:
            print("*"  , end = "    ")
        else:
            print(end = "   ")

    print()
