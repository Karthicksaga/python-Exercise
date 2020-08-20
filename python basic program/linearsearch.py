import random
def linear_search(num,result):
    for i in range(len(result)):
        if result[i] == num:
            return i
    return -1

def random_number():
    result=[]
    for i in range(90):
        
        result.append(i)
    return result
    
def player(num):
    a=random_number()
    b=num
    print("the given_number is found",linear_search(b,a))
player(100)