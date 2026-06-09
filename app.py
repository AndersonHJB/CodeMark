#!/usr/bin/env python
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "codemark_project.settings")
    from django.core.management import execute_from_command_line

    args = sys.argv
    if len(args) == 1:
        args = [args[0], "runserver", "0.0.0.0:8991"]
    execute_from_command_line(args)


if __name__ == "__main__":
    main()
