def reverse(s):
    return s[::-1]
def rev(s):
    palindrome = reverse(s)
    
    if palindrome == s:
        print("the given string is palindrome")
    else: 
        print("is not a palindrome")
rev("malayalam")