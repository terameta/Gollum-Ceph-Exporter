#!/bin/bash
cd ~/gollum.epmvirtual.com
pwd
date
git fetch origin
reslog=$(git log HEAD..origin/master --oneline)
echo $reslog
if [ "$reslog" != "" ] ; then
    echo thereischange
    git reset --hard origin/master
    git merge origin/master
    bower install
    npm install
    forever restart gollumluckynode
else
    echo nochange
fi
