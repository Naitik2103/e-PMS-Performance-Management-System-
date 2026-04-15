import Mailgen from "mailgen";
import nodemailer from "nodemailer";
//we can use mailgen package to generate the email content for the email verification and forgot password emails. Mailgen is a simple and easy to use package that allows us to generate beautiful and responsive email templates. We can customize the email templates as per our requirement. We can also use our own custom email templates if we want to. Mailgen provides a lot of options to customize the email templates. We can also use the default email templates provided by Mailgen if we want to. 
//we can also create a separate file for the email templates and import the email templates in the controllers where we want to send the emails. This way, we can keep our code organized and modular. We can also use the email templates in other parts of our application if we want to. For example, we can use the email templates in the notification system of our application to send notifications to the users.


const sendEmail = async (options) => {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    const smtpSecure = smtpPort == 465 ? true : false; // If the port is 465, then it is a secure connection, otherwise it is not a secure connection.

    if(!smtpHost || !smtpPort || !emailUser || !emailPass) {
        console.error("SMTP configuration is missing. Please check your environment variables.");
        throw new Error("SMTP configuration is missing. Please check your environment variables.");
        return;
    }


    const mailGenerator = new Mailgen({
        theme: "default",
        product: {
            name: "Project Management Platform",
            // link: "http://localhost:${process.env.PORT || 3000}"
            // link: "lwjdnjvcls"
            link: process.env.APP_URL || "http://localhost:3000"
        }
    })

    const emailTextual= mailGenerator.generatePlaintext(options.mailgenContent);
    const emailHTML = mailGenerator.generate(options.mailgenContent);

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure, // true for 465, false for other ports
        auth: {
            user: emailUser,   
            pass: emailPass
        }
    })

    const mail ={
        from: emailUser,
        to: options.to, 
        subject: options.subject,
        text: emailTextual,
        html: emailHTML
    }

    try {
        const info = await transporter.sendMail(mail);
        console.log("Email sent: " + info.response);
    } catch (error) {
        console.error("Error sending email: " , error);
    }
    
}


//This is email verification email template content generator function. This function takes the username and the verification URL as parameters and returns the email content for the email verification email. We can use this function in the email verification controller to generate the email content for the email verification email and then send the email to the user using nodemailer or any other email sending service.
const emailVerificationMailgenContent = (username, verifiationURL) => {
    return {
        body: {
            name: username,
            intro: "Welcome to our project management platform! We're excited to have you on board.",
            action: {
                instructions: "To get started with our project management platform, please click the button below to verify your email address:",
                button: {
                    text: "Verify Email",
                    link: verifiationURL,
                    colour: "#22BC66", // Optional action button color 
                }
            },
            outro: "If you did not sign up for our project management platform, please ignore this email. If you have any questions, feel free to reply to this email. We're here to help!"
        }
    }
}


//This is forgot password email teplate content generator function. This function takes the username and the password reset URL as parameters and returns the email content for the forgot password email. We can use this function in the forgot password controller to generate the email content for the forgot password email and then send the email to the user using nodemailer or any other email sending service.
const forgotPasswordMailgenContent = (username, passwordResetURL) => {
    return {
        body: {
            name: username,
            intro: "We received a request to reset your password for your account on our project management platform. If you made this request, please click the button below to reset your password:",
            action: {
                instructions: "To reset your password, please click the button below:",
                button: {
                    text: "Reset Password",
                    link: passwordResetURL,
                    colour: "#e7821c", // Optional action button color 
                }
            },
            outro: "If you did not request a password reset, please ignore this email. If you have any questions, feel free to reply to this email. We're here to help!"
        }
    }
}


export {
    emailVerificationMailgenContent,
    forgotPasswordMailgenContent,
    sendEmail   
}