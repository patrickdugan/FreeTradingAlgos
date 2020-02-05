# FreeTradingAlgos
For the people

Trying to make things accessible for people new to javascript or algo trading in general, helped me level up my programming tidiness.

Current version using Mike van Rossum's very well done API wrapper for Deribit.

https://www.npmjs.com/package/deribit-v2-ws

You have to go to the terminal (in Windows or Linux) and go to the folder where you've got the script downloaded; 
like "cd Users", cd "Name", cd "directory" - not literally, whatever the path is.

Now that you're in the folder, you have to intall Node.js, NPM then type NPM install deribit-v2-ws, and so on for all the require('async') looking packages.

https://www.guru99.com/download-install-node-js.html

https://www.npmjs.com/get-npm

The current verison of the code defaults to deribit.com for the client domain. So for testnet you'd have to change the code just a smidge. 
Instead of derb = new Derb(key,secret), derb = new Derb(key,secret,'test.deribit.com')

You'd go to test.deribit.com and create a new account, go to Account, API, generate some keys, copy/paste the key/secret strings 
into the script.

Test it out. You can put in a period for an hourly moving average.

Once you're comfortable with that, you can try it with your API keys for mainnet, with the real monies. 

To make this stop-updating thing run continously, npm install forever

https://www.npmjs.com/package/forever

To execute in the command line, type: node MATrailingStop.js

To execute it with forever, use: forever start MATrailingStop.js

Maybe there's a bug or something and it doesn't start. Command line... uh, commands for using forever are listed in the above link.

To make sure that your retail internet provider doesn't cut out when you really should have moved your stops up over night and
then there's a hairpin John Wick reversal, aw, should have gotten stopped out higher, you could rent a VPS for $5 a month,
why what an interesting opportunity to shill a ref. link:

https://www.linode.com/?r=99e6c2f81460d3f11fac895bbfdedc66de0dd1f9

If you click through that and run your system on a $5 Linode for 3 months, they'll credit me $20.

So it'd be like, a really sensible thing.

If you're new to servers and whatnot, I like this desktop client:

https://www.bitvise.com/

You tap in the ip address, the password they gen for you, ideally use SSL certs and such but hey I'm not your dad.

Then you'll see a terminal in the server instead of in your local device and you command line that interface in the same way.

Usually those boxes are Linux vs. Windows that most people use for retail PCs/Laptops. 

Command line is slightly different for Linux but not too different for the purposes of this exercise.

There you go, I just saved you 8 months of bashing your head against the wall. Cheers.
