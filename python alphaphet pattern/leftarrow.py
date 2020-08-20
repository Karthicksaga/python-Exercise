n=int(input())
a=n // 2 * 3
for i  in range(n):
    for j in range (n):
        if i == n // 2 or i+j == n // 2 or i-j == n // 2:
            print("*" ,end = "")
        else:
            print(end=' ')
    print()
        
