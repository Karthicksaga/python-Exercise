class customer:
	def __init__(self,name):
		self.name=name
		self.billamount=0
	def purchase(self):
		print("customer name"+ str(self.name),"bill amount" +str(self.billamount))
    def paybill(self,amount)
    	discount=5
    	total=self.billamount -discount*self.billamount/100
    	return total

c=customer("karthick")
c.pays_bill(200)
c.purchase()