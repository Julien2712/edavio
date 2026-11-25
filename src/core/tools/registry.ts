import type { ToolCategory, ToolModule } from './types'

class ToolRegistryImpl {
  private readonly tools = new Map<string, ToolModule>()

  register(tool: ToolModule): this {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool "${tool.id}" is already registered`)
    }
    this.tools.set(tool.id, tool)
    return this
  }

  get(id: string): ToolModule | undefined {
    return this.tools.get(id)
  }

  getByRoute(route: string): ToolModule | undefined {
    return this.list().find((tool) => tool.route === route)
  }

  list(): ToolModule[] {
    return [...this.tools.values()]
  }

  listByCategory(category: ToolCategory): ToolModule[] {
    return this.list().filter((tool) => tool.category === category)
  }
}

export const ToolRegistry = new ToolRegistryImpl()
