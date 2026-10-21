#!/bin/bash
cd /tmp/video
for s in 00 01 02 03 04 05 06 07 08 09 10; do
  ./rec scene$s.html frames 960 540 24 s$s 1 2>/dev/null | tail -1
done
echo "ALL RENDERED"
