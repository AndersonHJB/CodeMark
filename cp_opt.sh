cd /home/huangjiabao/domains/cm.class1v1.com/public_python/CodeMark
echo "进入 cm.class1v1.com CodeMark"
git pull
echo "同步成功"
cd ..
echo "回到上级目录"
cp -r ./CodeMark/* .
echo "复制成功..."
echo "网站代码更新成功！"
cd /home/huangjiabao/domains/cm.bornforthis.cn/public_python/CodeMark
echo "进入 cm.bornforthis.cn CodeMark"
git pull
echo "同步成功"
cd ..
echo "回到上级目录"
cp -r ./CodeMark/* .
echo "复制成功..."
cd ~
echo "全部成功"