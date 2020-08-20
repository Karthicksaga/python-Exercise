import smtplib
sender_mail= "karthicktj3@gmail.com"
receiver_mail ="karthicktj3@gmaill.com"
message = """ from : %s
To : %s
message: My test mail """ %(sender_mail,receiver_mail)

password = str(input("Enter the Password:"))

smtp_mail = smtplib.SMTP("smtp.gmail.com" , 587)
smtp_mail.starttls()

smtp_mail.login(sender_mail,password)
smtp_mail.sendmail(sender_mail,receiver_mail,message)

print("Email send successfully" ,str(receiver_mail))
