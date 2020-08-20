def gcd (a,b):
    if a > b:
        smaller = b
    else:
        smaller = a

    for i in range (1, smaller + 1 ):
        if (a % i == 0 and b % i == 0):
            gcd = i
    return gcd

a= int(input("Enter the number a:"))
b= int(input("Enter the number b:"))
print("Gcd of ",a ,"and",b ,"is:" , gcd(a,b))

        
