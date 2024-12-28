# -*- coding: utf-8 -*-
# @Time    : 2024/11/29 14:01
# @Author  : AI悦创
# @FileName: generate.py
# @Software: PyCharm
# @Blog    ：https://bornforthis.cn/
# code is far away from bugs with the god animal protecting
#    I love animals. They taste delicious.
base_root = '/Users/huangjiabao/GitHub/Github_Repo/CodeMark/'



def generate_text(paths):
    text = ''
    for path in paths:
        filename = path.split('/')[-1]
        with open(base_root + path, 'r') as f:
            content = f.read()
            text += filename + ':\n' + content + '\n'
    with open('text.txt', 'w') as f:
        f.write(text)

if __name__ == '__main__':
    paths = [
        'app.py',
        'templates/article.html',
        'templates/index.html',
        'templates/sharecode.html',
        'static/css/style.css',
    ]
    generate_text(paths)