#!/bin/bash
# $1 = 場景清單（空白分隔）
cd /tmp/video
for s in $@; do
  ./rec scene$s.html frames 960 540 24 s$s 1 2>/dev/null | tail -1
done
