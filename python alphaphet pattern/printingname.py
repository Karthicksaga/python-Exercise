#printin name as pramid
string = str(input("Enter the string:"))
k=len(string)

for row in range (k):
    for col in range (row+1):
        print(string[col] , end = " ")
    print()
