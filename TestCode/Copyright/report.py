import os
from datetime import datetime
from fpdf import FPDF

# 支持的文件扩展名
SUPPORTED_EXTENSIONS = {'.py', '.js', '.html', '.css', '.sh', '.md'}

class CodePDF(FPDF):
    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=15)
        self.add_font("Mono", "", "/Users/huangjiabao/GitHub/Github_Repo/CodeMark/TestCode/Copyright/fonts/LXGWWenKaiMono-Regular.ttf", uni=True)
        self.set_font("Mono", size=10)

    def header(self):
        self.set_font("Mono", size=10)
        self.cell(0, 10, f'代码汇总 - {datetime.now().strftime("%Y-%m-%d")}', ln=True, align='C')

    def add_code_page(self, filepath, code_lines):
        self.add_page()
        self.set_font("Mono", size=10)
        self.multi_cell(0, 10, f'文件路径: {filepath}\n{"=" * 80}', align='L')
        for line in code_lines:
            self.multi_cell(0, 5, line.rstrip(), align='L')


def collect_code_files(root_dir):
    code_files = []
    for folder, _, files in os.walk(root_dir):
        for file in files:
            ext = os.path.splitext(file)[1]
            if ext.lower() in SUPPORTED_EXTENSIONS:
                code_files.append(os.path.join(folder, file))
    return code_files

def main(project_path, output_pdf_path):
    pdf = CodePDF()
    code_files = collect_code_files(project_path)

    for file_path in code_files:
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                pdf.add_code_page(file_path, lines)
        except Exception as e:
            print(f"读取失败：{file_path}，原因：{e}")

    pdf.output(output_pdf_path)
    print(f"✅ PDF 已生成：{output_pdf_path}")

if __name__ == "__main__":
    # 修改为你的项目根目录
    project_dir = "/Users/huangjiabao/GitHub/Github_Repo/CodeMark"
    output_pdf = "CodeMark.pdf"
    main(project_dir, output_pdf)
