q1 ="""1. 	
A train running at the speed of 60 km/hr crosses a pole in 9 seconds. What is the length of the train?

A.  120 metres
B.  180 metres
C.  324 metres
D.  150 metres """

q2 ="""2. 	
A train 125 m long passes a man, running at 5 km/hr in the same direction in which the train is going, in 10 seconds. The speed of the train is:

A.	45 km/hr
B.	50 km/hr
C.	54 km/hr
D.	55 km/h """

q3= """3. 	
The length of the bridge, which a train 130 metres long and travelling at 45 km/hr can cross in 30 seconds, is:

A.	200 m
B.	225 m
C.	245 m
D.	250 m """


question ={ q1 : "A"  , q2 : "B" ,q3 : "C" }
Name = str(input("Enter your Name:"))
score=0
print ("Welcome " +    Name )


for i in question:
    print (i)
    flag=input("Are you skip the question (yes/no):")
    if flag == "yes":
        break
    else:
        continue
   
    option=input("Select The Answer Below :(A/B/C/D):")

    
    
    if  option == question[i]:
        score =score + 1
    else:
        score = score - 1
        
    print ("Current score:" , score)

print("Your total score", score)



    


