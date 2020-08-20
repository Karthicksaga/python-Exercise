class Customer:
    def __init__(self, cust_id, cust_name, location):
        self.cust_id = cust_id
        self.cust_name = cust_name
        self.location = location

list_of_customers = [Customer(101, 'Mark', 'US'),
Customer(102, 'Jane', 'Japan'),
Customer(103, 'Kumar', 'India')]

dict_of_customer={
            "m1":Customer(101, "mark" ,"us"),
            "m2":Customer(102, 'Jane', 'Japan'),
            "m3":Customer(103, 'Kumar', 'India')
            }
    for customer in list_of_customers:
    dict_of_customer[customer.location] = customer

print ("Customer name in India is "+dict_of_customer["India"].cust_name)
            
            
for x,y in dict_of_customer.items():
    print(y.location)
            
            
            
            
    
    
    
    
    
    
    
    
    
    
                                                