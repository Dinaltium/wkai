import os

def list_files(startpath, exclude_dirs=None):
    if exclude_dirs is None:
        exclude_dirs = {'.git', 'node_modules', '.next', '__pycache__', 'venv', '.vscode', '.github', 'auto'}
    
    print(f"{os.path.basename(startpath)}/")
    for root, dirs, files in os.walk(startpath):
        # Filter dirs in-place to avoid recursing into them
        original_dirs = list(dirs)
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        rel_path = os.path.relpath(root, startpath)
        if rel_path == ".":
            level = 0
        else:
            level = rel_path.count(os.sep) + 1
            
        indent = "│   " * (level - 1) + "├── " if level > 0 else ""
        if level > 0:
            print(f"{indent}{os.path.basename(root)}/")
        
        file_indent = "│   " * level + "├── "
        for f in files:
            if f != "generate_tree.py": # exclude this script
                print(f"{file_indent}{f}")
        
        # Show excluded dirs at current level
        for d in original_dirs:
            if d in exclude_dirs:
                print(f"{file_indent}{d}/ (contents excluded)")

if __name__ == "__main__":
    current_dir = os.path.abspath(".")
    list_files(current_dir)
