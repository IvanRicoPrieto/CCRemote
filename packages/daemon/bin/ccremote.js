#!/usr/bin/env node
import { createCLI } from '../dist/cli.js';

const program = createCLI();
program.parse();
