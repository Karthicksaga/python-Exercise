def array_advance(a):
    fr = 0
    i = 0
    length = len(a) - 1
    while i <=  fr and fr < length:
        fr = max( fr ,a[i] + i)
        i += 1
    return fr >= length


a1=[1,2,3,4,55]
print(array_advance(a1))
