#!/bin/bash
cd ~/gollum.epmvirtual.com
forever -a --minUptime 1000 --spinSleepTime 5000 --uid "gollumluckynode" start server/app.js