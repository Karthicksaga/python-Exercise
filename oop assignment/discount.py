#discount  We can update the static value using the class name.
class product:
    discount=30
    def __init__(self,name,id,price,brand):
        self.name=name
        self.id=id
        self.price=price
        self.brand=brand
    def discount(self):
        if self.brand == "Mobile":
            total_price=self.price -self.price*product.discount/100
            print("product name"+self.name +"product id" ,self.id +"price" +str(total_price))
        else:
            discount=10
            total_price=self.price -self.price * discount/100
            print("product name"+self.name +"product id" ,self.id +"price" +str(total_price))
def enable:
    product.discount=90
def disable:
    product.discount=5



pro1=product("Apple",01,20000,"mobile")
pro2=product("samsung",04,30000,"shoe")
pro3=product("Apple",01,20000,"mobile")
pro4=product("Apple",01,20000,"mobile")
pro5=product("Apple",01,20000,"mobile")
pro6=product("Apple",01,20000,"mobile")

pro1.discount()
pro2.discount()
enable()
pro3.discount()
pro4.discount()
pro5.discount()
disable()
pro6.discount()