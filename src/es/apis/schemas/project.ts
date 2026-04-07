/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-redeclare */
import { z } from 'zod'

import { AcknowledgedResponseBase, ProjectRouting } from './_types.ts'

export const ProjectRoutingExpression = z.string()
export type ProjectRoutingExpression = z.infer<typeof ProjectRoutingExpression>

export const ProjectProjectRoutingExpression = z.object({
  expression: ProjectRoutingExpression
})
export type ProjectProjectRoutingExpression = z.infer<typeof ProjectProjectRoutingExpression>

export const ProjectNamedProjectRoutingExpressions = z.record(z.string(), ProjectProjectRoutingExpression)
export type ProjectNamedProjectRoutingExpressions = z.infer<typeof ProjectNamedProjectRoutingExpressions>

/** Create or update project routing expressions. */
export const ProjectCreateManyRoutingRequest = z.object({
  expressions: ProjectNamedProjectRoutingExpressions.optional().meta({ found_in: 'body' })
})
export type ProjectCreateManyRoutingRequest = z.infer<typeof ProjectCreateManyRoutingRequest>

export const ProjectCreateManyRoutingResponse = z.lazy(() => AcknowledgedResponseBase)
export type ProjectCreateManyRoutingResponse = z.infer<typeof ProjectCreateManyRoutingResponse>

/** Create or update a project routing expression. */
export const ProjectCreateRoutingRequest = z.object({
  name: z.string().describe('The name of project routing expression').meta({ found_in: 'path' }),
  expressions: ProjectProjectRoutingExpression.optional().meta({ found_in: 'body' })
})
export type ProjectCreateRoutingRequest = z.infer<typeof ProjectCreateRoutingRequest>

export const ProjectCreateRoutingResponse = z.lazy(() => AcknowledgedResponseBase)
export type ProjectCreateRoutingResponse = z.infer<typeof ProjectCreateRoutingResponse>

/** Delete a project routing expression. */
export const ProjectDeleteRoutingRequest = z.object({
  name: z.string().describe('The name of project routing expression').meta({ found_in: 'path' })
})
export type ProjectDeleteRoutingRequest = z.infer<typeof ProjectDeleteRoutingRequest>

export const ProjectDeleteRoutingResponse = z.lazy(() => AcknowledgedResponseBase)
export type ProjectDeleteRoutingResponse = z.infer<typeof ProjectDeleteRoutingResponse>

/** Get project routing expressions. */
export const ProjectGetManyRoutingRequest = z.object({
})
export type ProjectGetManyRoutingRequest = z.infer<typeof ProjectGetManyRoutingRequest>

export const ProjectGetManyRoutingResponse = ProjectNamedProjectRoutingExpressions
export type ProjectGetManyRoutingResponse = z.infer<typeof ProjectGetManyRoutingResponse>

/** Get a project routing expression. */
export const ProjectGetRoutingRequest = z.object({
  name: z.string().describe('The name of project routing expression').meta({ found_in: 'path' })
})
export type ProjectGetRoutingRequest = z.infer<typeof ProjectGetRoutingRequest>

export const ProjectGetRoutingResponse = ProjectProjectRoutingExpression
export type ProjectGetRoutingResponse = z.infer<typeof ProjectGetRoutingResponse>

export const ProjectTagsTags = z.object({
  _id: z.string(),
  _alias: z.string(),
  _type: z.string(),
  _organisation: z.string()
}).catchall(z.any())
export type ProjectTagsTags = z.infer<typeof ProjectTagsTags>

export const ProjectTagsProjectTags = z.object({
  origin: z.record(z.string(), ProjectTagsTags),
  linked_projects: z.record(z.string(), ProjectTagsTags).optional()
})
export type ProjectTagsProjectTags = z.infer<typeof ProjectTagsProjectTags>

/**
 * Get tags.
 *
 * Get the tags that are defined for the project.
 */
export const ProjectTagsRequest = z.object({
})
export type ProjectTagsRequest = z.infer<typeof ProjectTagsRequest>

export const ProjectTagsResponse = ProjectTagsProjectTags
export type ProjectTagsResponse = z.infer<typeof ProjectTagsResponse>
