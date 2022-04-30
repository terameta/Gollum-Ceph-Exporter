# luckynode

## Install

You can install this package with `npm`

### npm

#### prepare the configuration file
cp dbdetails.default.conf dbdetails.conf

```Copy the files to a folder and run

npm install


Update gollum.service file according to your needs
Copy gollum.service file to /lib/systemd/system/epmtools.service
Run below commands:
sudo systemctl daemon-reload
sudo systemctl enable gollum.service
sudo systemctl start gollum.service
Create a crontab entry with the following line (after updating to the correct folder):
* * * * * sudo sh -c "chmod +x ~/gollum.epmvirtual.com/croner.sh; sh ~/gollum.epmvirtual.com/croner.sh >> ~/gollum.epmvirtual.com/log/croner.log"

```

## License

Closed License

Copyright (c) LuckyNode. http://luckynode.com
