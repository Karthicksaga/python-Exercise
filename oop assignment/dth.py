from abc import ABCMeta
class DirectToHomeServices(metaclass=ABCMeta):
    counter=101
    def __init__(self,consumer_name):
        self.__consumer_name=consumer_name
    def get_consumer_number(self,number):
        pass
    def get_consumer_name(self):
        return self.__consumer_name

class BasePackage(DirectToHomeServices):
    
    def __init__(self,consumer_number,base_pack_name,name_subscripition_period):
        super().__init__()
        self.__base_pack_name=base_pack_name
        self.__subsricription_period=_subsricription_period
    def get_base_pack_name(self):
        pass
    def get__subscription_period(self):
        if subsricription_period == 
    def validate_base_pack_name(self):
        if base_pack_name == "silver" or "gold" or "platinum":
            print("Base Pack Name " , get_base_pack_name())
            return base_pack_name
        else:
            base_pack_name = "silver"
            print("Base package name is incorrect")
    def calculate_monthly_rent(self):
        discount
        if get.subsricription_period() => 1 and <= 24:
            di
            if validate_base_pack_name() == "silver" and self.subsricription_period >12:
                monthly_rent_silver=345
                discount=10
                
                
                
            
            
    
        