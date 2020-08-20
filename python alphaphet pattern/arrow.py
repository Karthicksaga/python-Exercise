n=int(input())
a=n // 2 * 3
for i  in range(n):
    for j in range (n):
        if i == n // 2 or j-i == n // 2 or i+j == a:
            print("*" ,end = "")
        else:
            print(end=' ')
    print()
        
